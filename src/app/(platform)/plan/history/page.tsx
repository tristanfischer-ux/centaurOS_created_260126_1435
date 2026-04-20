/**
 * @file page.tsx — Plan redesign "History" surface (Phase 3, flag-gated).
 *
 * @description Auto-populated decision log (PLAN-SCHEMA §9) UNIONed at read
 * time with legacy `knowledge_notes` per §A.2 data-preservation. Never
 * destructively migrate knowledge_notes — both tables feed the same
 * timeline; writes go to history_entries only.
 *
 * Search-first — the hero is the search box, NOT a feed. FTS is already
 * indexed on `(title || ' ' || coalesce(body,''))` for history_entries; we
 * apply the same search to knowledge_notes via title + content.
 *
 * URL state:
 *   ?q=...          plain-text query → plainto_tsquery('english', q)
 *   ?type=...       entry_type filter (single value)
 *   ?goalId=...     strategic_goals.id filter
 *   ?specialist=... specialist_key / specialist_slug filter
 *   ?page=N         zero-based offset page, 50 per page
 *
 * Flag-gated: OFF → redirect to legacy /knowledge.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { HistoryEmptyState } from "@/components/plan/empty-states"
import { typography } from "@/lib/design-system/typography"
import type { HistoryEntryRow, HistoryEntryType } from "@/types/plan"

import { HistorySearchBar } from "./history-search-bar"
import { HistoryTimeline } from "./history-timeline"
import type { TimelineItem } from "./timeline-types"

export const metadata: Metadata = {
    title: "History · Plan",
    description: "Your auto-populated decision log — every choice, searchable.",
}

const PAGE_SIZE = 50

type SearchParams = Promise<{
    q?: string
    type?: string
    goalId?: string
    specialist?: string
    page?: string
}>

const ENTRY_TYPE_FILTERS: Array<{ value: string; label: string }> = [
    { value: "decision", label: "Decision" },
    { value: "pressure_test", label: "Pressure-test" },
    { value: "update_sent", label: "Update" },
    { value: "goal_state_changed", label: "Goal change" },
    { value: "gutcheck_outcome", label: "Gut-check" },
    { value: "specialist_rec_accepted", label: "Rec accepted" },
    { value: "specialist_rec_rejected", label: "Rec rejected" },
    { value: "manual", label: "Manual note" },
    { value: "knowledge", label: "Knowledge note" },
]

const HISTORY_ENTRY_TYPES = new Set<HistoryEntryType>([
    "decision",
    "pressure_test",
    "update_sent",
    "goal_pinned",
    "goal_state_changed",
    "specialist_rec_accepted",
    "specialist_rec_rejected",
    "gutcheck_outcome",
    "manual",
])

function bodyPreview(body: string | null, limit = 180): string | null {
    if (!body) return null
    // Strip markdown headings / list markers for a cleaner one-line preview.
    const clean = body
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^[-*]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim()
    if (!clean) return null
    return clean.length > limit ? `${clean.slice(0, limit)}…` : clean
}

export default async function PlanHistoryPage({
    searchParams,
}: {
    searchParams: SearchParams
}): Promise<React.ReactNode> {
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect("/knowledge")

    const sp = await searchParams
    const q = sp.q?.trim() ?? ""
    const type = sp.type?.trim() ?? ""
    const goalId = sp.goalId?.trim() ?? ""
    const specialist = sp.specialist?.trim() ?? ""
    const page = Math.max(0, Number(sp.page ?? "0") || 0)
    const offset = page * PAGE_SIZE

    const foundryId = await getFoundryIdCached().catch(() => null)

    if (!foundryId) {
        return (
            <div className="max-w-5xl space-y-8">
                <header className="pb-4 border-b border-muted">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>History</h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Every decision, update, and pressure-test from this foundry — searchable.
                    </p>
                </header>
                <HistoryEmptyState />
            </div>
        )
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any

    // ── history_entries query ──────────────────────────────────────────────
    // FTS is indexed on `to_tsvector('english', title || ' ' || coalesce(body,''))`
    // as an expression index (PLAN-SCHEMA §9) — there's no tsvector column to
    // target via textSearch(). V1 uses ilike on title+body; the FTS index still
    // helps via expression-index planning on the `to_tsvector(...)` path used
    // by PostgREST's full-text search when a matching column exists. If/when
    // we add a stored tsvector column we swap this to .textSearch(...).
    let hq = anySb
        .from("history_entries")
        .select("*")
        .eq("foundry_id", foundryId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

    if (q) {
        hq = hq.or(`title.ilike.%${sanitizeLike(q)}%,body.ilike.%${sanitizeLike(q)}%`)
    }
    if (type && type !== "knowledge" && HISTORY_ENTRY_TYPES.has(type as HistoryEntryType)) {
        hq = hq.eq("entry_type", type)
    }
    if (goalId) hq = hq.eq("goal_id", goalId)
    if (specialist) hq = hq.eq("actor_id", specialist)

    // ── knowledge_notes query (legacy, UNIONed at read time) ───────────────
    const wantKnowledge = !type || type === "knowledge"
    let knowledgeRes: { data: KnowledgeNoteRow[] | null } = { data: [] }
    if (wantKnowledge) {
        let kq = supabase
            .from("knowledge_notes")
            .select("id, title, content, created_at, source_specialist, is_archived")
            .eq("foundry_id", foundryId)
            .eq("is_archived", false)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1)

        if (q) {
            kq = kq.or(`title.ilike.%${sanitizeLike(q)}%,content.ilike.%${sanitizeLike(q)}%`)
        }
        if (specialist) {
            kq = kq.eq("source_specialist", specialist)
        }
        knowledgeRes = (await kq) as { data: KnowledgeNoteRow[] | null }
    }

    const historyRes = (await hq) as { data: HistoryEntryRow[] | null }
    const historyRows: HistoryEntryRow[] = historyRes.data ?? []
    const knowledgeRows: KnowledgeNoteRow[] = knowledgeRes.data ?? []

    // ── hydrate goal titles for history rows ───────────────────────────────
    const goalIds = Array.from(
        new Set(historyRows.map((r) => r.goal_id).filter((v): v is string => !!v)),
    )
    const goalTitles = new Map<string, string>()
    if (goalIds.length > 0) {
        const { data: goalRows } = await anySb
            .from("strategic_goals")
            .select("id, title")
            .in("id", goalIds)
        for (const g of ((goalRows as Array<{ id: string; title: string }> | null) ?? [])) {
            goalTitles.set(g.id, g.title)
        }
    }

    // ── resolve actor labels (best-effort) ─────────────────────────────────
    const userActorIds = Array.from(
        new Set(
            historyRows
                .filter((r) => r.actor_type === "founder" || r.actor_type === "fractional")
                .map((r) => r.actor_id)
                .filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v)),
        ),
    )
    const specialistSlugs = Array.from(
        new Set([
            ...historyRows
                .filter((r) => r.actor_type === "specialist")
                .map((r) => r.actor_id)
                .filter((v): v is string => !!v),
            ...knowledgeRows.map((r) => r.source_specialist).filter((v): v is string => !!v),
        ]),
    )

    const actorNames = new Map<string, string>()
    if (userActorIds.length > 0) {
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userActorIds)
        for (const p of (profiles ?? [])) {
            if (p.id && p.full_name) actorNames.set(p.id, p.full_name)
        }
    }
    if (specialistSlugs.length > 0) {
        const { data: specialists } = await supabase
            .from("specialist_profiles")
            .select("specialist_key, display_name")
            .in("specialist_key", specialistSlugs)
        for (const s of ((specialists ?? []) as Array<{
            specialist_key: string
            display_name: string
        }>)) {
            actorNames.set(s.specialist_key, s.display_name)
        }
    }

    // ── build unified timeline ─────────────────────────────────────────────
    const timeline: TimelineItem[] = [
        ...historyRows.map<TimelineItem>((r) => ({
            id: r.id,
            source: "history",
            entry_type: r.entry_type,
            title: r.title,
            body_preview: bodyPreview(r.body),
            actor_label: r.actor_id ? actorNames.get(r.actor_id) ?? labelForActor(r) : labelForActor(r),
            goal_id: r.goal_id,
            goal_title: r.goal_id ? goalTitles.get(r.goal_id) ?? null : null,
            outcome: r.outcome,
            created_at: r.created_at,
        })),
        ...knowledgeRows.map<TimelineItem>((r) => ({
            id: r.id,
            source: "knowledge",
            entry_type: "manual",
            title: r.title,
            body_preview: bodyPreview(r.content),
            actor_label: r.source_specialist
                ? actorNames.get(r.source_specialist) ?? r.source_specialist
                : null,
            goal_id: null,
            goal_title: null,
            outcome: null,
            created_at: r.created_at,
        })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    // dedupe — shouldn't collide across tables, but guard against repeat ids.
    const seen = new Set<string>()
    const deduped = timeline.filter((item) => {
        const key = `${item.source}:${item.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    // ── stats ─────────────────────────────────────────────────────────────
    const quarterStartIso = quarterStart().toISOString()
    const [{ count: quarterCount }, { count: recAccepted }, { count: recRejected }] =
        await Promise.all([
            anySb
                .from("history_entries")
                .select("id", { count: "exact", head: true })
                .eq("foundry_id", foundryId)
                .gte("created_at", quarterStartIso),
            anySb
                .from("history_entries")
                .select("id", { count: "exact", head: true })
                .eq("foundry_id", foundryId)
                .eq("entry_type", "specialist_rec_accepted"),
            anySb
                .from("history_entries")
                .select("id", { count: "exact", head: true })
                .eq("foundry_id", foundryId)
                .eq("entry_type", "specialist_rec_rejected"),
        ])

    const totalRecResponses = (recAccepted ?? 0) + (recRejected ?? 0)
    const reversalRate =
        totalRecResponses > 0 ? Math.round(((recRejected ?? 0) * 100) / totalRecResponses) : null

    // Most-referenced goal in the last 90 days
    const { data: refGoalRows } = await anySb
        .from("history_entries")
        .select("goal_id")
        .eq("foundry_id", foundryId)
        .not("goal_id", "is", null)
        .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .limit(500)
    const goalCounter = new Map<string, number>()
    for (const r of ((refGoalRows as Array<{ goal_id: string | null }> | null) ?? [])) {
        if (r.goal_id) goalCounter.set(r.goal_id, (goalCounter.get(r.goal_id) ?? 0) + 1)
    }
    let mostReferencedGoal: { id: string; title: string; count: number } | null = null
    if (goalCounter.size > 0) {
        const [topId, topCount] = Array.from(goalCounter.entries()).sort((a, b) => b[1] - a[1])[0]!
        let title = goalTitles.get(topId)
        if (!title) {
            const { data: g } = await anySb
                .from("strategic_goals")
                .select("title")
                .eq("id", topId)
                .maybeSingle()
            title = (g as { title?: string } | null)?.title ?? "Untitled goal"
        }
        mostReferencedGoal = { id: topId, title, count: topCount }
    }

    const hasAnyFilters = Boolean(q || type || goalId || specialist)
    const showingEmpty = deduped.length === 0

    return (
        <div className="max-w-5xl space-y-6">
            {/* Hero ─────────────────────────────────────────────────────── */}
            <header className="pb-4 border-b border-muted">
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>History</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Every decision, update, and pressure-test from this foundry — searchable.
                </p>
            </header>

            <div className="mt-6">
                <HistorySearchBar initialQuery={q} />
            </div>

            {/* Filter pills ─────────────────────────────────────────────── */}
            <FilterPills
                currentType={type}
                q={q}
                goalId={goalId}
                specialist={specialist}
            />

            {/* Two-column layout: timeline + right-rail stats ──────────── */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                    {showingEmpty ? (
                        hasAnyFilters ? (
                            <Card>
                                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                                    No entries match these filters.{" "}
                                    <Link
                                        href="/plan/history"
                                        className="font-medium text-international-orange hover:underline"
                                    >
                                        Clear filters
                                    </Link>
                                    .
                                </CardContent>
                            </Card>
                        ) : (
                            <HistoryEmptyState />
                        )
                    ) : (
                        <>
                            <HistoryTimeline items={deduped} />
                            {deduped.length >= PAGE_SIZE ? (
                                <div className="mt-4 flex justify-center">
                                    <LoadMore
                                        q={q}
                                        type={type}
                                        goalId={goalId}
                                        specialist={specialist}
                                        page={page}
                                    />
                                </div>
                            ) : null}
                        </>
                    )}
                </div>

                <aside className="space-y-4">
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                This quarter
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground">
                                {quarterCount ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">entries logged</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Reversal rate
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground">
                                {reversalRate === null ? "—" : `${reversalRate}%`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Specialist recs rejected vs total responses
                            </p>
                        </CardContent>
                    </Card>
                    {mostReferencedGoal ? (
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    Most-referenced goal
                                </p>
                                <Link
                                    href={`/plan/goal/${mostReferencedGoal.id}`}
                                    className="mt-1 block truncate text-base font-semibold text-foreground hover:text-international-orange"
                                >
                                    {mostReferencedGoal.title}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                    {mostReferencedGoal.count} reference
                                    {mostReferencedGoal.count === 1 ? "" : "s"} · last 90 days
                                </p>
                            </CardContent>
                        </Card>
                    ) : null}
                </aside>
            </div>
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────────── */

interface KnowledgeNoteRow {
    id: string
    title: string
    content: string | null
    created_at: string
    source_specialist: string | null
    is_archived: boolean
}

function labelForActor(r: HistoryEntryRow): string | null {
    if (r.actor_type === "system") return "System"
    if (!r.actor_id) return null
    return r.actor_id
}

function sanitizeLike(s: string): string {
    // Postgrest ilike: escape % and , which break the or() filter syntax.
    return s.replace(/[%,()]/g, " ").trim()
}

function quarterStart(): Date {
    const now = new Date()
    const quarterIdx = Math.floor(now.getUTCMonth() / 3)
    return new Date(Date.UTC(now.getUTCFullYear(), quarterIdx * 3, 1))
}

function FilterPills({
    currentType,
    q,
    goalId,
    specialist,
}: {
    currentType: string
    q: string
    goalId: string
    specialist: string
}): React.ReactNode {
    function hrefFor(next: string): string {
        const params = new URLSearchParams()
        if (q) params.set("q", q)
        if (next) params.set("type", next)
        if (goalId) params.set("goalId", goalId)
        if (specialist) params.set("specialist", specialist)
        const qs = params.toString()
        return qs ? `/plan/history?${qs}` : "/plan/history"
    }

    return (
        <div className="mt-4 flex flex-wrap gap-2">
            <Link
                href={hrefFor("")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    currentType === ""
                        ? "border-international-orange bg-international-orange/10 text-international-orange"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
            >
                All
            </Link>
            {ENTRY_TYPE_FILTERS.map((f) => (
                <Link
                    key={f.value}
                    href={hrefFor(f.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        currentType === f.value
                            ? "border-international-orange bg-international-orange/10 text-international-orange"
                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                >
                    {f.label}
                </Link>
            ))}
        </div>
    )
}

function LoadMore({
    q,
    type,
    goalId,
    specialist,
    page,
}: {
    q: string
    type: string
    goalId: string
    specialist: string
    page: number
}): React.ReactNode {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (type) params.set("type", type)
    if (goalId) params.set("goalId", goalId)
    if (specialist) params.set("specialist", specialist)
    params.set("page", String(page + 1))
    return (
        <Button asChild variant="outline" size="sm">
            <Link href={`/plan/history?${params.toString()}`}>Load more</Link>
        </Button>
    )
}

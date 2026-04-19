/**
 * @file page.tsx — Plan Report drill-in (compose new / view sent).
 *
 * Phase 3 Plan redesign · Chunk C.2. Flag-gated.
 *
 * Route variants:
 *   /plan/report/new  → ReportComposer seeded from live foundry data (pinned
 *                       goals + this-week tasks + recent history entries).
 *   /plan/report/<uuid> → Read-only view of a previously sent report.
 *
 * Reference: PLAN-SCHEMA §12 (reports_sent), §10 (pressure_test_sessions).
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"

import type { ReportsSentRow, StrategicGoalRow } from "@/types/plan"

import { ReportComposer, type ReportComposerDraft } from "./report-composer"
import { ReportReadonlyView } from "./report-readonly-view"

export const metadata: Metadata = {
    title: "Report · Plan",
    description: "Draft, pressure-test and send an update.",
}

type PageProps = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PlanReportDetailPage({
    params,
}: PageProps): Promise<React.ReactNode> {
    const { id } = await params

    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) {
        // Flag OFF → forward to the legacy /reports detail route. "new" has
        // no legacy equivalent — send them to the legacy list.
        if (id === "new") redirect("/reports")
        redirect(`/reports/${id}`)
    }

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached().catch(() => null)
    if (!foundryId) redirect("/onboarding")

    // Plan tables aren't in the generated Database types yet — cast at the
    // query boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any

    // ── Compose path: /plan/report/new ────────────────────────────────────
    if (id === "new") {
        // Seed draft-from-live-data server-side so the composer opens
        // pre-filled. We intentionally assemble the same shape draftReport()
        // does rather than calling it — the composer is a client component,
        // and dispatching a server action at render time would add a round
        // trip for no benefit. The founder can click "Regenerate draft" in
        // the composer to re-hit draftReport() after switching targets.
        const [goalsRes, tasksRes, historyRes] = await Promise.all([
            untyped
                .from("strategic_goals")
                .select("id, title, state, quarter")
                .eq("foundry_id", foundryId)
                .eq("is_pinned", true)
                .is("deleted_at", null)
                .order("pin_order", { ascending: true })
                .limit(3),
            untyped
                .from("tasks")
                .select("title, status")
                .eq("foundry_id", foundryId)
                .eq("horizon", "this_week")
                .in("status", ["done", "completed"])
                .limit(8),
            untyped
                .from("history_entries")
                .select("title")
                .eq("foundry_id", foundryId)
                .in("entry_type", ["decision", "goal_state_changed", "pressure_test"])
                .order("created_at", { ascending: false })
                .limit(5),
        ])

        const pinnedGoals =
            (goalsRes.data as Array<
                Pick<StrategicGoalRow, "id" | "title" | "state" | "quarter">
            > | null) ?? []
        const thisWeekTaskTitles =
            ((tasksRes.data as Array<{ title: string }> | null) ?? []).map(
                (t) => t.title,
            )
        const recentDecisionTitles =
            ((historyRes.data as Array<{ title: string }> | null) ?? []).map(
                (h) => h.title,
            )

        const draft: ReportComposerDraft = {
            initialTarget: "weekly_team",
            initialSubject: `Weekly team update · ${new Date()
                .toISOString()
                .slice(0, 10)}`,
            initialBody: seedBody({
                targetLabel: "this week",
                pinnedGoals,
                thisWeekTaskTitles,
                recentDecisionTitles,
            }),
            pulledFromGoalIds: pinnedGoals.map((g) => g.id),
        }

        return (
            <div className="mx-auto max-w-5xl p-6 sm:p-8">
                <ReportComposer draft={draft} />
            </div>
        )
    }

    // ── Read-only path: /plan/report/<uuid> ───────────────────────────────
    if (!UUID_RE.test(id)) {
        return (
            <div className="mx-auto max-w-2xl p-8">
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Report not found
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        The link you used doesn&rsquo;t match a real update.
                    </p>
                </div>
            </div>
        )
    }

    const { data: report } = await untyped
        .from("reports_sent")
        .select("*")
        .eq("id", id)
        .eq("foundry_id", foundryId)
        .maybeSingle<ReportsSentRow>()

    if (!report) {
        return (
            <div className="mx-auto max-w-2xl p-8">
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Report not found
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        This update was removed, or you don&rsquo;t have access to
                        it.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-3xl p-6 sm:p-8">
            <ReportReadonlyView report={report} />
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function seedBody(params: {
    targetLabel: string
    pinnedGoals: Array<Pick<StrategicGoalRow, "title" | "state">>
    thisWeekTaskTitles: string[]
    recentDecisionTitles: string[]
}): string {
    const { targetLabel, pinnedGoals, thisWeekTaskTitles, recentDecisionTitles } =
        params
    const lines: string[] = []
    lines.push(`## Progress ${targetLabel}`)
    if (pinnedGoals.length === 0) {
        lines.push(
            "- _No Strategic Goals pinned yet — replace this line with what moved._",
        )
    } else {
        for (const g of pinnedGoals) {
            lines.push(
                `- **${g.title}** (${g.state.replace(/_/g, " ")})`,
            )
        }
    }
    lines.push("")
    lines.push("## What we shipped")
    if (thisWeekTaskTitles.length === 0) {
        lines.push("- _Add the 2–3 most important tasks that closed._")
    } else {
        for (const t of thisWeekTaskTitles.slice(0, 8)) {
            lines.push(`- ${t}`)
        }
    }
    lines.push("")
    lines.push("## Decisions and direction")
    if (recentDecisionTitles.length === 0) {
        lines.push("- _What changed in thinking? What did we decide?_")
    } else {
        for (const d of recentDecisionTitles.slice(0, 5)) {
            lines.push(`- ${d}`)
        }
    }
    lines.push("")
    lines.push("## Asks")
    lines.push(
        "- _Intros, hires, introductions — what do you need from the reader?_",
    )
    return lines.join("\n")
}
